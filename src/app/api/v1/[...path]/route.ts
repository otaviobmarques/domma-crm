import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key" };

function keyOf(req: NextRequest) {
  const a = req.headers.get("authorization");
  if (a?.toLowerCase().startsWith("bearer ")) return a.slice(7).trim();
  return req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("key") ?? "";
}
async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await sb().rpc(fn, args);
  if (error) {
    const status = error.code === "28000" ? 401 : /permiss|acesso/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status, headers: cors });
  }
  return NextResponse.json(data, { headers: cors });
}
const body = async (req: NextRequest) => { try { return await req.json(); } catch { return {}; } };
const notFound = () => NextResponse.json({ error: "Rota não encontrada. Veja Configurações › API." }, { status: 404, headers: cors });

export async function OPTIONS() { return new NextResponse(null, { headers: cors }); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; const key = keyOf(req); const sp = req.nextUrl.searchParams;
  if (path[0] === "boards" && path.length === 1) return call("api_boards", { p_key: key });
  if (path[0] === "boards" && path[2] === "cards") return call("api_cards", { p_key: key, p_board: path[1], p_phase: sp.get("phase"), p_limit: Number(sp.get("limit") ?? 100), p_offset: Number(sp.get("offset") ?? 0) });
  if (path[0] === "databases" && path[2] === "records") return call("api_records", { p_key: key, p_database: path[1], p_limit: Number(sp.get("limit") ?? 100), p_offset: Number(sp.get("offset") ?? 0) });
  if (path[0] === "reports" && path[1]) return call("api_report", { p_key: key, p_report: path[1] });
  return notFound();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; const key = keyOf(req); const b = await body(req);
  if (path[0] === "boards" && path[2] === "cards") return call("api_create_card", { p_key: key, p_board: path[1], p_values: b.values ?? b, p_phase: b.phase_id ?? null });
  if (path[0] === "cards" && path[2] === "move") return call("api_move_card", { p_key: key, p_card: path[1], p_phase: b.phase_id });
  return notFound();
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; const key = keyOf(req); const b = await body(req);
  if (path[0] === "cards" && path[1]) return call("api_update_card", { p_key: key, p_card: path[1], p_values: b.values ?? b });
  return notFound();
}
