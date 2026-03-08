import { NextRequest, NextResponse } from "next/server";
import { starEntry, unstarEntry } from "@/lib/feedly";

export async function PUT(request: NextRequest) {
  try {
    const { entryId } = await request.json();
    if (!entryId) {
      return NextResponse.json(
        { error: "entryId is required" },
        { status: 400 }
      );
    }
    await starEntry(entryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { entryId } = await request.json();
    if (!entryId) {
      return NextResponse.json(
        { error: "entryId is required" },
        { status: 400 }
      );
    }
    await unstarEntry(entryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
