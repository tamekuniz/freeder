import { NextRequest, NextResponse } from "next/server";
import { starEntry, unstarEntry, FeedlyTokenNotFoundError } from "@/lib/feedly";
import { requireAuthUserId } from "@/lib/api-auth";

export async function PUT(request: NextRequest) {
  const auth = await requireAuthUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const { entryId } = await request.json();
    if (!entryId) {
      return NextResponse.json(
        { error: "entryId is required" },
        { status: 400 }
      );
    }
    await starEntry(auth.userId, entryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof FeedlyTokenNotFoundError) {
      return NextResponse.json({ error: "feedly token not configured" }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const { entryId } = await request.json();
    if (!entryId) {
      return NextResponse.json(
        { error: "entryId is required" },
        { status: 400 }
      );
    }
    await unstarEntry(auth.userId, entryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof FeedlyTokenNotFoundError) {
      return NextResponse.json({ error: "feedly token not configured" }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
