import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import bcrypt from "npm:bcryptjs@3.0.2";
import { corsHeaders } from "../_shared/cors.ts";
import { ensurePortalAccess } from "../_shared/libraryPortal.ts";
import { createAuditEvent } from "../_shared/libraryOps.ts";
import { generatePassword } from "../_shared/utils.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    const action = String(body.action || "").trim();

    if (!libraryId || !action) {
      return new Response(JSON.stringify({ error: "library_id and action are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user } = await ensurePortalAccess(req, libraryId, { requireOwner: true, allowExpiredOwnerRead: true });

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim() || null;
      const plainPassword = String(body.password || generatePassword());

      if (!email || plainPassword.length < 6) {
        throw new Error("Valid email and password are required to create staff");
      }

      const passwordHash = await bcrypt.hash(plainPassword, 12);
      let { data: staffUser } = await supabase
        .from("library_users")
        .select("id, email, role, status")
        .ilike("email", email)
        .maybeSingle();

      if (staffUser?.role === "owner") {
        throw new Error("That email already belongs to an owner account");
      }

      if (!staffUser) {
        const inserted = await supabase
          .from("library_users")
          .insert({
            email,
            phone,
            password_hash: passwordHash,
            role: "staff",
            status: "active",
          })
          .select("id, email, role, status")
          .single();

        if (inserted.error) {
          throw new Error(`Failed to create staff user: ${inserted.error.message}`);
        }
        staffUser = inserted.data;
      } else {
        const { error: updateUserError } = await supabase
          .from("library_users")
          .update({ phone, password_hash: passwordHash, role: "staff", status: "active" })
          .eq("id", staffUser.id);

        if (updateUserError) {
          throw new Error(`Failed to update staff user: ${updateUserError.message}`);
        }
      }

      const { error: accessError } = await supabase
        .from("library_user_access")
        .upsert({
          user_id: staffUser.id,
          library_id: libraryId,
          role: "staff",
          is_primary_owner: false,
          status: "active",
        }, { onConflict: "user_id,library_id" });

      if (accessError) {
        throw new Error(`Failed to grant staff access: ${accessError.message}`);
      }

      await createAuditEvent(supabase, {
        library_id: libraryId,
        actor_user_id: user.id,
        actor_role: "owner",
        event_type: "staff_created",
        entity_type: "library_user",
        entity_id: staffUser.id,
        summary: `${email} added as staff`,
        metadata: { email },
      });

      return new Response(JSON.stringify({ success: true, staff_user_id: staffUser.id, email, plain_password: plainPassword }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const staffUserId = String(body.staff_user_id || "").trim();
    if (!staffUserId) {
      throw new Error("staff_user_id is required for this action");
    }

    if (action === "reset_password") {
      const plainPassword = String(body.password || generatePassword());
      if (plainPassword.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }

      const passwordHash = await bcrypt.hash(plainPassword, 12);
      const { error } = await supabase
        .from("library_users")
        .update({ password_hash: passwordHash, status: "active" })
        .eq("id", staffUserId)
        .eq("role", "staff");

      if (error) {
        throw new Error(`Failed to reset staff password: ${error.message}`);
      }

      await createAuditEvent(supabase, {
        library_id: libraryId,
        actor_user_id: user.id,
        actor_role: "owner",
        event_type: "staff_password_reset",
        entity_type: "library_user",
        entity_id: staffUserId,
        summary: `Staff password reset`,
        metadata: {},
      });

      return new Response(JSON.stringify({ success: true, plain_password: plainPassword }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "deactivate" || action === "remove") {
      const nextStatus = action === "deactivate" ? "inactive" : "archived";
      const { error: accessError } = await supabase
        .from("library_user_access")
        .update({ status: nextStatus })
        .eq("library_id", libraryId)
        .eq("user_id", staffUserId)
        .eq("role", "staff");

      if (accessError) {
        throw new Error(`Failed to update staff access: ${accessError.message}`);
      }

      const { data: activeAccessRows } = await supabase
        .from("library_user_access")
        .select("id")
        .eq("user_id", staffUserId)
        .eq("status", "active");

      if (!activeAccessRows || activeAccessRows.length === 0) {
        await supabase
          .from("library_users")
          .update({ status: nextStatus === "archived" ? "archived" : "inactive" })
          .eq("id", staffUserId)
          .eq("role", "staff");
      }

      await createAuditEvent(supabase, {
        library_id: libraryId,
        actor_user_id: user.id,
        actor_role: "owner",
        event_type: action === "remove" ? "staff_removed" : "staff_deactivated",
        entity_type: "library_user",
        entity_id: staffUserId,
        summary: action === "remove" ? `Staff removed` : `Staff deactivated`,
        metadata: {},
      });

      return new Response(JSON.stringify({ success: true, status: nextStatus }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /required|owner|password|email|only 2 active staff/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
