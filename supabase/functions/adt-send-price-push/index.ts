import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SignJWT,
  importPKCS8,
} from "https://deno.land/x/jose@v4.15.5/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FIREBASE_SERVICE_ACCOUNT_RAW =
  Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ||
  Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ||
  "";

const FIREBASE_SERVICE_ACCOUNT =
  FIREBASE_SERVICE_ACCOUNT_RAW
    ? JSON.parse(FIREBASE_SERVICE_ACCOUNT_RAW)
    : null;

const FIREBASE_PROJECT_ID =
  String(
    FIREBASE_SERVICE_ACCOUNT?.project_id ||
    Deno.env.get("FIREBASE_PROJECT_ID") ||
    ""
  );

const FIREBASE_CLIENT_EMAIL =
  String(
    FIREBASE_SERVICE_ACCOUNT?.client_email ||
    Deno.env.get("FIREBASE_CLIENT_EMAIL") ||
    ""
  );

const FIREBASE_PRIVATE_KEY =
  String(
    FIREBASE_SERVICE_ACCOUNT?.private_key ||
    Deno.env.get("FIREBASE_PRIVATE_KEY") ||
    ""
  ).replace(/\\n/g, "\n");

const admin = createClient(
  SUPABASE_URL,
  SERVICE_ROLE,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);


// =====================================================
// Firebase Access Token
// =====================================================

async function getFirebaseAccessToken() {
  if (
    !FIREBASE_PROJECT_ID ||
    !FIREBASE_CLIENT_EMAIL ||
    !FIREBASE_PRIVATE_KEY
  ) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is missing or invalid"
    );
  }
  const key = await importPKCS8(
    FIREBASE_PRIVATE_KEY,
    "RS256"
  );

  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    scope:
      "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
    })
    .setIssuer(FIREBASE_CLIENT_EMAIL)
    .setSubject(FIREBASE_CLIENT_EMAIL)
    .setAudience(
      "https://oauth2.googleapis.com/token"
    )
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      "FIREBASE_AUTH_FAILED: " +
        (await res.text())
    );
  }

  const data = await res.json();

  return data.access_token;
}


// =====================================================
// فحص هل التوكن مات من Firebase
// =====================================================

function isDeadTokenError(data: any) {
  const message = String(
    data?.error?.message || ""
  ).toUpperCase();

  const status = String(
    data?.error?.status || ""
  ).toUpperCase();

  const details = Array.isArray(
    data?.error?.details
  )
    ? data.error.details
    : [];

  const errorCode = details
    .map((x: any) =>
      String(x?.errorCode || "").toUpperCase()
    )
    .find(Boolean) || "";

  return (
    errorCode === "UNREGISTERED" ||
    message.includes("NOTREGISTERED") ||
    message.includes("UNREGISTERED") ||
    (
      status === "NOT_FOUND" &&
      (
        message.includes("REGISTER") ||
        errorCode === "UNREGISTERED"
      )
    )
  );
}


// =====================================================
// تعطيل التوكن القديم
// =====================================================

async function disableDeadToken(
  token: string
) {
  try {
    const { error } = await admin
      .from("adt_push_tokens")
      .update({
        enabled: false,
        updated_at:
          new Date().toISOString(),
      })
      .eq("token", token);

    if (error) {
      console.error(
        "[PUSH] Failed to disable dead token:",
        error
      );

      return false;
    }

    console.log(
      "[PUSH] Dead token disabled:",
      token.slice(0, 18) + "..."
    );

    return true;
  } catch (e) {
    console.error(
      "[PUSH] disableDeadToken error:",
      e
    );

    return false;
  }
}


// =====================================================
// صلاحية مرسل الإشعار
//
// team_members.user_id في ADT هو device identity، وليس Supabase auth.uid().
// لذلك نتحقق من session token المخصص للتطبيق ثم نتحقق مرة ثانية من
// العضوية والصلاحيات في الفريق المستهدف. لا نثق في actor_name القادم من العميل.
// =====================================================
async function authorizeActor(
  teamId: string,
  actorUserId: string,
  operationType: string,
  sessionToken: string
) {
  const cleanTeam = String(teamId || "").trim();
  const cleanActor = String(actorUserId || "").trim();
  const cleanType = String(operationType || "").trim();
  if (!cleanTeam || !cleanActor) throw new Error("UNAUTHORIZED_PUSH_ACTOR");

  const cleanSession = String(sessionToken || "").trim();
  if (!cleanSession) throw new Error("MISSING_ADT_SESSION");

  // The same session validation used by the app, executed with service role.
  // A failed/expired session must never reach token delivery.
  const { data: sessionData, error: sessionError } = await admin.rpc(
    "adt_validate_session",
    { p_session_token: cleanSession, p_device_id: cleanActor }
  );
  if (sessionError) throw new Error("SESSION_VALIDATION_FAILED");
  if (sessionData === false || sessionData?.valid === false || sessionData?.ok === false) {
    throw new Error("INVALID_ADT_SESSION");
  }

  const { data: member, error: memberError } = await admin
    .from("team_members")
    .select("user_id,user_name,role,status,can_manage_money_records,can_audit,can_grocery_audit,can_audit_reset,can_manage_daily_sales")
    .eq("team_id", cleanTeam)
    .eq("user_id", cleanActor)
    .maybeSingle();

  if (memberError || !member) throw new Error("TEAM_ACCESS_DENIED");
  const role = String(member.role || "").toLowerCase();
  const approved = String(member.status || "").toLowerCase() === "approved" || role === "manager";
  if (!approved) throw new Error("TEAM_ACCESS_DENIED");

  const managerLike = ["owner", "manager", "admin"].includes(role);
  let allowed = true;
  if (cleanType === "customer_receipt" || cleanType === "supplier_payment") {
    allowed = managerLike || member.can_manage_money_records === true;
  } else if (cleanType === "daily_sale") {
    allowed = managerLike || member.can_manage_daily_sales === true;
  } else if (cleanType === "audit_changed") {
    allowed = managerLike || member.can_audit === true;
  } else if (cleanType === "audit_reset") {
    allowed = managerLike || member.can_audit_reset === true;
  } else if (cleanType === "grocery_audit_changed") {
    allowed = managerLike || member.can_grocery_audit === true;
  } else if (cleanType === "grocery_permission_changed") {
    allowed = managerLike;
  }

  if (!allowed) throw new Error("PUSH_PERMISSION_DENIED");
  return member;
}

// =====================================================
// إرسال إشعار لجهاز واحد
// =====================================================

async function sendNotification(
  accessToken: string,
  token: string,
  title: string,
  notificationBody: string,
  notificationData: Record<string, string>
) {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${accessToken}`,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        message: {
          token,
          ...(notificationData?.silent === "1" ? {} : {
            notification: { title, body: notificationBody },
            android: {
              priority: "high",
              notification: { sound: "default" },
            },
          }),
          data: notificationData,
          ...(notificationData?.silent === "1" ? { android: { priority: "high" } } : {}),
        },
      }),
    }
  );


  // نجاح الإرسال
  if (res.ok) {
    return {
      ok: true,
      dead: false,
      error: null,
    };
  }


  // Firebase رجع خطأ
  const raw = await res.text();

  let errorData: any = null;

  try {
    errorData =
      JSON.parse(raw);
  } catch (_) {
    errorData = null;
  }


  // =================================================
  // Token ميت / ملغي
  // =================================================

  if (
    errorData &&
    isDeadTokenError(errorData)
  ) {
    await disableDeadToken(token);

    return {
      ok: false,
      dead: true,
      error:
        "FCM_TOKEN_UNREGISTERED",
    };
  }


  // خطأ آخر حقيقي
  return {
    ok: false,
    dead: false,
    error:
      "FCM_SEND_FAILED: " + raw,
  };
}


// =====================================================
// تجهيز نص إشعارات العمليات الجديدة
// =====================================================

function buildOperationNotification(body: any) {
  const type = String(body?.type || body?.change_type || "").trim();
  const actorName = String(body?.actor_name || "مستخدم").trim();
  const subject = String(body?.subject || body?.product_name || "").trim();
  const amount = String(body?.amount || body?.new_sell_price || "").trim();
  const details = String(body?.details || "").trim();
  const explicitBody = String(body?.body || "").trim();
  const currency = String(body?.currency_symbol || "د.ل").trim();

  const amountText = amount ? `${amount} ${currency}` : "";
  let title = "إشعار جديد";
  let message = details || subject || "تم تسجيل عملية جديدة";

  if (type === "customer_receipt") {
    title = "استلام أموال";
    message = `استلم ${actorName}${amountText ? ` مبلغ ${amountText}` : ""}${subject ? ` من ${subject}` : ""}`;
  } else if (type === "supplier_payment") {
    title = "تحويل إلى موردين";
    message = `حوّل ${actorName}${amountText ? ` مبلغ ${amountText}` : ""}${subject ? ` إلى ${subject}` : ""}`;
  } else if (type === "daily_sale") {
    title = "مبيعات جديدة";
    message = `سجّل ${actorName} مبيعات${amountText ? ` بقيمة ${amountText}` : ""}`;
  } else if (type === "damaged_goods") {
    title = "بضاعة تالفة";
    message = `سجّل ${actorName} «${subject || "صنف"}» كبضاعة تالفة`;
  } else if (type === "audit_changed") {
    title = "تحديث الجرد";
    message = `حدّث ${actorName} جرد${subject ? ` «${subject}»` : ""}`;
  } else if (type === "audit_reset") {
    title = "تصفير الجرد";
    message = `قام ${actorName} بتصفير الجرد`;
  } else if (type === "grocery_audit_changed") {
    title = "تحديث الجرد السريع";
    message = `حدّث ${actorName} الجرد السريع`;
  } else if (type === "grocery_permission_changed") {
    title = "تحديث صلاحية الجرد السريع";
    message = `تم تحديث صلاحية الجرد السريع بواسطة ${actorName}`;
  }

  if (explicitBody) message = explicitBody;

  return {
    type,
    title,
    message,
    data: {
      type,
      team_id: String(body?.team_id || ""),
      actor_user_id: String(body?.actor_user_id || ""),
      actor_name: actorName,
      subject,
      amount,
      details,
      currency_symbol: currency,
      silent: [
        "audit_changed",
        "audit_reset",
        "grocery_audit_changed",
        "grocery_permission_changed",
      ].includes(type) ? "1" : "0",
    },
  };
}


async function sendOperationToTeam(
  accessToken: string,
  teamId: string,
  actorUserId: string,
  body: any
) {
  const notification = buildOperationNotification(body);
  const allowedTypes = new Set([
    "customer_receipt",
    "supplier_payment",
    "daily_sale",
    "damaged_goods",
    "audit_changed",
    "audit_reset",
    "grocery_audit_changed",
    "grocery_permission_changed",
  ]);

  if (!allowedTypes.has(notification.type)) {
    return null;
  }

  let allowedMoneyUsers: Set<string> | null = null;

  if (
    notification.type === "customer_receipt" ||
    notification.type === "supplier_payment"
  ) {
    const {
      data: members,
      error: membersError,
    } = await admin
      .from("team_members")
      .select("user_id,role,status,can_manage_money_records")
      .eq("team_id", teamId)
      .eq("status", "approved");

    if (membersError) throw membersError;

    allowedMoneyUsers = new Set(
      (Array.isArray(members) ? members : [])
        .filter((member: any) =>
          ["owner", "manager", "admin"].includes(
            String(member?.role || "").toLowerCase()
          ) || member?.can_manage_money_records === true
        )
        .map((member: any) => String(member?.user_id || "").trim())
        .filter(Boolean)
    );
  }

  const { data: rows, error } = await admin
    .from("adt_push_tokens")
    .select("token,user_id")
    .eq("team_id", teamId)
    .eq("enabled", true);

  if (error) throw error;

  const tokens = Array.from(new Set(
    (Array.isArray(rows) ? rows : [])
      .filter((row: any) => String(row?.user_id || "") !== actorUserId)
      .filter((row: any) =>
        !allowedMoneyUsers ||
        allowedMoneyUsers.has(String(row?.user_id || "").trim())
      )
      .map((row: any) => String(row?.token || "").trim())
      .filter(Boolean)
  ));

  let sent = 0;
  let deadTokens = 0;
  let failedTokens = 0;

  for (const token of tokens) {
    try {
      const result = await sendNotification(
        accessToken,
        token,
        notification.title,
        notification.message,
        notification.data
      );
      if (result.ok) sent++;
      else if (result.dead) deadTokens++;
      else failedTokens++;
    } catch (_) {
      failedTokens++;
    }
  }

  return {
    ok: true,
    type: notification.type,
    sent,
    dead_tokens: deadTokens,
    failed_tokens: failedTokens,
  };
}


// =====================================================
// Edge Function
// =====================================================

Deno.serve(async (req) => {
  try {

    if (req.method !== "POST") {
      return new Response(
        "Method Not Allowed",
        {
          status: 405,
        }
      );
    }


    const body =
      await req.json();

    const reqHeaderSessionToken = String(
      req.headers.get("X-ADT-Session-Token") || ""
    ).trim();


    const teamId = String(
      body.team_id || ""
    );


    const actorUserId = String(
      body.actor_user_id || ""
    );


    if (!teamId || !actorUserId) {
      return Response.json(
        {
          ok: false,
          error:
            "MISSING_DATA",
        },

        {
          status: 400,
        }
      );
    }

    const requestedType = String(body.type || body.change_type || "").trim();
    let actorMember: any;
    try {
      actorMember = await authorizeActor(
        teamId,
        actorUserId,
        requestedType,
        reqHeaderSessionToken
      );
    } catch (authError) {
      const reason = authError instanceof Error ? authError.message : "PUSH_AUTH_FAILED";
      const status = [
        "MISSING_ADT_SESSION",
        "INVALID_ADT_SESSION",
        "SESSION_VALIDATION_FAILED",
        "UNAUTHORIZED_PUSH_ACTOR",
      ].includes(reason) ? 401 : 403;
      return Response.json({ ok: false, error: reason }, { status });
    }

    // لا نثق باسم المرسل القادم من WebView. الاسم الموثوق هو اسم العضوية الحالية.
    body.actor_name = String(
      actorMember?.user_name || "مستخدم"
    ).trim() || "مستخدم";


    // إشعارات العمليات تُرسل مباشرة لأجهزة الفريق.
    // إشعار السعر يظل على نظام الـJobs الأصلي الموجود بالأسفل.
    if ([
      "customer_receipt",
      "supplier_payment",
      "daily_sale",
      "damaged_goods",
      "audit_changed",
      "audit_reset",
      "grocery_audit_changed",
      "grocery_permission_changed",
    ].includes(requestedType)) {
      const accessToken = await getFirebaseAccessToken();
      const result = await sendOperationToTeam(
        accessToken,
        teamId,
        actorUserId,
        body
      );

      return Response.json(result);
    }


    // =================================================
    // اسحب Jobs الخاصة بالفريق
    // =================================================

    const {
      data: jobs,
      error,
    } = await admin.rpc(
      "adt_claim_price_push_jobs",
      {
        p_team_id:
          teamId,

        p_actor_user_id:
          actorUserId,
      }
    );


    if (error) {
      throw error;
    }


    if (
      !Array.isArray(jobs) ||
      jobs.length === 0
    ) {
      return Response.json({
        ok: true,
        sent: 0,
        dead_tokens: 0,
        failed_tokens: 0,
      });
    }


    const accessToken =
      await getFirebaseAccessToken();


    let sent = 0;

    let deadTokens = 0;

    let failedTokens = 0;


    // =================================================
    // معالجة كل Job
    // =================================================

    for (const job of jobs) {

      let jobSuccess = true;

      const realErrors: string[] = [];


      const tokens =
        Array.isArray(job.tokens)
          ? job.tokens
          : [];


      // ===============================================
      // إرسال لكل Token بشكل منفصل
      // ===============================================

      for (const tokenValue of tokens) {

        const token =
          String(tokenValue || "").trim();


        if (!token) {
          continue;
        }


        try {

          const result =
            await sendNotification(
              accessToken,
              token,
              "تغيير سعر البيع",
              `${String(body.actor_name || "مستخدم").trim()} غيّر سعر بيع «${job.product_name}» إلى ${Number(job.sell_price).toFixed(2)} ${String(body.currency_symbol || "د.ل").trim()}`,
              {
                type: "sell_price",
                change_type: "sell_price",
                actor_name: String(body.actor_name || "مستخدم").trim(),
                product_name: String(job.product_name),
                sell_price: String(job.sell_price),
                new_sell_price: String(job.sell_price),
                currency_symbol: String(body.currency_symbol || "د.ل").trim(),
              }
            );


          // نجح
          if (result.ok) {
            sent++;

            continue;
          }


          // Token ميت:
          // نعطله ونكمل بدون إسقاط الـJob
          if (result.dead) {
            deadTokens++;

            console.warn(
              "[PUSH] UNREGISTERED token removed from delivery:",
              token.slice(0, 18) + "..."
            );

            continue;
          }


          // خطأ حقيقي في الإرسال
          failedTokens++;

          jobSuccess = false;

          if (result.error) {
            realErrors.push(
              result.error
            );
          }


        } catch (e) {

          failedTokens++;

          jobSuccess = false;

          realErrors.push(
            e instanceof Error
              ? e.message
              : String(e)
          );
        }
      }


      // =================================================
      // إنهاء الـJob
      //
      // UNREGISTERED وحده لا يعتبر فشل Job.
      // =================================================

      const errorText =
        realErrors.length
          ? realErrors.join("\n\n")
          : null;


      const {
        error: finishError,
      } = await admin.rpc(
        "adt_finish_price_push_job",
        {
          p_job_id:
            job.id,

          p_success:
            jobSuccess,

          p_error:
            errorText,
        }
      );


      if (finishError) {
        console.error(
          "[PUSH] finish job failed:",
          finishError
        );
      }
    }


    // =================================================
    // النتيجة
    // =================================================

    return Response.json({
      ok: true,

      sent,

      dead_tokens:
        deadTokens,

      failed_tokens:
        failedTokens,
    });


  } catch (e) {

    console.error(
      "[PUSH] Function error:",
      e
    );


    return Response.json(
      {
        ok: false,

        error:
          e instanceof Error
            ? e.message
            : String(e),
      },

      {
        status: 500,
      }
    );
  }
});
