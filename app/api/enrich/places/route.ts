import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { cleanEnv } from "@/lib/env";

/**
 * POST /api/enrich/places
 * 以現有 place_id 呼叫 Places Details API，更新電話 / 地圖 / 評論
 * body: { all: true } | { brand_id }
 * 串流 NDJSON 進度
 */

export const maxDuration = 300;

type SB = ReturnType<typeof getSupabaseServerClient>;

const PLACES_BASE = "https://places.googleapis.com/v1/places";
const FIELD_MASK =
  "nationalPhoneNumber,googleMapsUri,rating,userRatingCount,reviews,websiteUri";

interface PlaceDetails {
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  reviews?: {
    rating?: number;
    text?: { text: string; languageCode: string };
    authorAttribution?: { displayName: string };
    relativePublishTimeDescription?: string;
  }[];
}

async function upsertChannel(sb: SB, brandId: string, channel: string, value: string) {
  const { data: exist } = await sb
    .from("brand_channels")
    .select("id")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .maybeSingle();
  if (exist) {
    await sb
      .from("brand_channels")
      .update({ value, fetched_at: new Date().toISOString() })
      .eq("id", exist.id);
  } else {
    await sb.from("brand_channels").insert({
      brand_id: brandId,
      channel,
      value,
      fetched_at: new Date().toISOString(),
    });
  }
}

export async function POST(request: NextRequest) {
  const apiKey = cleanEnv("GOOGLE_PLACES_API_KEY");
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "GOOGLE_PLACES_API_KEY 未設定" },
      { status: 500 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {}

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const emit = async (obj: Record<string, unknown>) =>
    writer.write(enc.encode(JSON.stringify(obj) + "\n"));

  (async () => {
    const sb = getSupabaseServerClient();
    try {
      let q = sb
        .from("stores")
        .select("id, name, place_id, brand_id")
        .not("place_id", "is", null);

      if (body.brand_id) q = q.eq("brand_id", String(body.brand_id));

      const { data: stores } = await q;

      if (!stores || stores.length === 0) {
        await emit({ type: "error", text: "找不到有 place_id 的門市" });
        return;
      }

      await emit({
        type: "step",
        text: `更新 ${stores.length} 間門市的電話 / 地圖 / 評論…`,
      });

      let updated = 0,
        failed = 0;

      for (let i = 0; i < stores.length; i++) {
        const store = stores[i];
        const prefix = `[${i + 1}/${stores.length}]`;

        try {
          const res = await fetch(
            `${PLACES_BASE}/${store.place_id}?languageCode=zh-TW`,
            {
              headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": FIELD_MASK,
              },
              signal: AbortSignal.timeout(12000),
            }
          );

          if (!res.ok) {
            failed++;
            await emit({
              type: "store",
              ok: false,
              text: `${prefix} ✕ ${store.name}：API ${res.status}`,
            });
            continue;
          }

          const place: PlaceDetails = await res.json();

          // 更新 stores 欄位
          const patch: Record<string, unknown> = {};
          if (place.nationalPhoneNumber) patch.phone = place.nationalPhoneNumber;
          if (place.googleMapsUri) patch.gmaps_url = place.googleMapsUri;
          if (place.rating != null) patch.rating = place.rating;
          if (place.userRatingCount != null) patch.review_count = place.userRatingCount;
          if (place.websiteUri) patch.website = place.websiteUri;
          if (Object.keys(patch).length > 0) {
            await sb.from("stores").update(patch).eq("id", store.id);
          }

          // 更新 brand_channels：電話 / 地圖
          if (place.nationalPhoneNumber) {
            await upsertChannel(sb, store.brand_id, "phone", place.nationalPhoneNumber);
          }
          if (place.googleMapsUri) {
            await upsertChannel(sb, store.brand_id, "map", place.googleMapsUri);
          }

          // 更新評論（刪舊插新）
          if (place.reviews?.length) {
            await sb.from("store_reviews").delete().eq("store_id", store.id);
            await sb.from("store_reviews").insert(
              place.reviews.slice(0, 5).map((r) => ({
                store_id: store.id,
                rating: r.rating ?? null,
                text: r.text?.text || null,
                author_name: r.authorAttribution?.displayName || null,
                relative_time: r.relativePublishTimeDescription || null,
              }))
            );
          }

          updated++;
          const parts: string[] = [];
          if (place.nationalPhoneNumber) parts.push("電話");
          if (place.googleMapsUri) parts.push("地圖");
          if (place.reviews?.length) parts.push(`${place.reviews.length} 則評論`);
          await emit({
            type: "store",
            ok: true,
            text: `${prefix} ✓ ${store.name}：${parts.join("、") || "已更新"}`,
          });
        } catch (e) {
          failed++;
          await emit({
            type: "store",
            ok: false,
            text: `${prefix} ✕ ${store.name}：${e instanceof Error ? e.message : "失敗"}`,
          });
        }

        if (i < stores.length - 1) await new Promise((r) => setTimeout(r, 80));
      }

      await emit({
        type: "done",
        data: { total: stores.length, updated, failed },
      });
    } catch (e) {
      await emit({
        type: "error",
        text: e instanceof Error ? e.message : "更新失敗",
      });
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
