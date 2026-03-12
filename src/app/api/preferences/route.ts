import { NextRequest, NextResponse } from "next/server";
import { getAllPreferences, setPreference } from "@/lib/db";
import { requireLogin } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  try {
    const prefs = getAllPreferences(auth.userId);
    return NextResponse.json(prefs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "key and value are required" },
        { status: 400 }
      );
    }

    setPreference(key, String(value), auth.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
