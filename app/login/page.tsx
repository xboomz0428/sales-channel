"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (d.success) router.replace(next);
      else setErr(d.error || "登入失敗");
    } catch { setErr("連線失敗"); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="card">
      <div className="logo">通路開發系統</div>
      <div className="sub">請輸入通行密碼登入</div>
      <input className="in" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder="通行密碼" autoFocus />
      {err && <div className="err">{err}</div>}
      <button className="btn" disabled={busy || !password}>{busy ? "登入中…" : "登入"}</button>
      <style jsx>{`
        .card { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 16px; padding: 30px 28px; width: 320px; max-width: 92vw; box-shadow: 0 10px 40px rgba(46,69,53,.12); display: flex; flex-direction: column; gap: 12px; }
        .logo { font-family: 'Noto Serif TC', serif; font-size: 21px; font-weight: 700; color: #2f3d2f; text-align: center; }
        .sub { font-size: 13px; color: #8a8472; text-align: center; margin-bottom: 6px; }
        .in { border: 1px solid #d9d3c4; border-radius: 9px; padding: 11px 13px; font-size: 15px; font-family: inherit; background: #fff; outline: none; }
        .in:focus { border-color: #4a6b3f; }
        .btn { border: none; border-radius: 999px; padding: 11px; font-size: 15px; font-weight: 700; background: #4a6b3f; color: #fff; cursor: pointer; }
        .btn:disabled { opacity: .5; cursor: default; }
        .err { font-size: 13px; color: #a4452f; text-align: center; }
      `}</style>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="wrap">
      <Suspense fallback={null}><LoginForm /></Suspense>
      <style jsx>{`
        .wrap { min-height: 100vh; display: grid; place-items: center; background: #f3f0e7; font-family: 'Noto Sans TC', sans-serif; padding: 20px; }
      `}</style>
    </div>
  );
}
