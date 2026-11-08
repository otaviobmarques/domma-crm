import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export async function OPTIONS() { return new NextResponse(null, { headers: cors }); }

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let payload: unknown = {};
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) payload = await req.json();
    else if (ct.includes("form")) payload = Object.fromEntries((await req.formData()).entries());
    else { const t = await req.text(); payload = t ? JSON.parse(t) : {}; }
  } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400, headers: cors }); }
  const { data, error } = await sb().rpc("webhook_ingest", { p_token: token, p_payload: payload });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: error.code === "28000" ? 404 : 400, headers: cors });
  return NextResponse.json(data, { status: (data as any)?.ok ? 201 : 422, headers: cors });
}

export async function GET() {
  return NextResponse.json({ ok: true, info: "Envie um POST com JSON para criar um card neste board." }, { headers: cors });
}
