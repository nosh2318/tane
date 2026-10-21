// たね：サーバーとのつなぎ
// - window.claude.use("sample") の形でAIを呼べるようにする（試作と同じ呼び方のまま本番のサーバー関数へ流す）
// - 端末ごとに匿名ログインし、ストックやプロジェクトを Supabase に保存する
// - メールでつなぐと、別の端末に引き継げる
// 設定（config.js の window.TANE_CONFIG）が空なら何もせず、アプリは端末の中だけで動く。
(() => {
  const CFG = window.TANE_CONFIG || {};
  const ON = !!(CFG.supabaseUrl && CFG.anonKey);
  const KEYS = ["tane-swipe", "tane-projects"];
  const META = "tane-meta";
  let sb = null, booting = null;

  const meta = () => { try { return JSON.parse(localStorage.getItem(META) || "{}") } catch { return {} } };
  const setMeta = (m) => { try { localStorage.setItem(META, JSON.stringify(m)) } catch {} };

  async function boot() {
    if (!ON) throw { code: "sampling_disabled" };
    if (booting) return booting;
    booting = (async () => {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm");
      sb = createClient(CFG.supabaseUrl, CFG.anonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
      let { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const r = await sb.auth.signInAnonymously();
        if (r.error) throw r.error;
        session = r.data.session;
      }
      await pull();
      drawAccount();
      sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "USER_UPDATED") drawAccount() });
      return sb;
    })();
    booting.catch(() => { booting = null });
    return booting;
  }
  const token = async () => (await sb.auth.getSession()).data.session?.access_token;

  // ---- 保存：書き換えから2秒まとめて送る。新しい方を残す（キーごと） ----
  const timers = {};
  window.taneSync = (key) => {
    const m = meta(); m[key] = new Date().toISOString(); setMeta(m);
    if (!ON) return;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => push(key).catch(() => {}), 2000);
  };
  async function push(key) {
    await boot();
    const raw = localStorage.getItem(key); if (!raw) return;
    const { data: { user } } = await sb.auth.getUser(); if (!user) return;
    await sb.from("user_state").upsert({ user_id: user.id, key, value: JSON.parse(raw), updated_at: meta()[key] || new Date().toISOString() });
  }
  async function pull() {
    const { data, error } = await sb.from("user_state").select("key,value,updated_at");
    if (error || !data) return;
    const m = meta(); let changed = false;
    for (const row of data) {
      if (!KEYS.includes(row.key)) continue;
      if (!m[row.key] || new Date(row.updated_at) > new Date(m[row.key])) {
        localStorage.setItem(row.key, JSON.stringify(row.value)); m[row.key] = row.updated_at; changed = true;
      }
    }
    for (const k of KEYS) if (localStorage.getItem(k) && !data.some(r => r.key === k)) push(k).catch(() => {});
    if (changed) { setMeta(m); if (!sessionStorage.getItem("tane-pulled")) { sessionStorage.setItem("tane-pulled", "1"); location.reload() } }
  }

  // ---- AI：試作の sample と同じ形 ----
  async function call(prompt, { json = false, onText, signal } = {}) {
    await boot();
    let res;
    try {
      res = await fetch(CFG.supabaseUrl + "/functions/v1/ai", {
        method: "POST", signal,
        headers: { Authorization: "Bearer " + await token(), apikey: CFG.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, json }),
      });
    } catch (e) { throw { code: e?.name === "AbortError" ? "cancelled" : "failed" } }
    if (!res.body) throw { code: "failed" };
    const rd = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "";
    try {
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.t === "text") { text += ev.v; onText?.({ text }) }
          else if (ev.t === "error") throw { code: ev.code === "refused" ? "failed" : ev.code, text };
        }
      }
    } catch (e) { if (e?.name === "AbortError") throw { code: "cancelled", text }; throw e?.code ? e : { code: "failed", text } }
    return text;
  }
  function parseJSON(t) {
    const s = t.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
    const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
    try { return JSON.parse(s.slice(a, b + 1)) } catch { throw { code: "invalid_json" } }
  }
  const sample = (prompt, opt) => call(prompt, opt).then(text => ({ text }));
  sample.json = (prompt, opt = {}) => call(prompt, { ...opt, json: true }).then(parseJSON);

  if (!window.claude?.use) {
    window.claude = { use: async (name) => { if (name !== "sample") throw { code: "not_granted" }; await boot(); return sample } };
  }

  // ---- 引き継ぎ（ストック画面の下） ----
  function drawAccount() {
    const el = document.getElementById("acct"); if (!el || !sb) return;
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      if (user.email) {
        el.innerHTML = `<p class="acct-p">${esc(user.email)} とつながっています。別の端末でも同じメールで開けば、ストックとプロジェクトが引き継がれます。</p>`;
        return;
      }
      el.innerHTML = `<details class="acct"><summary>別の端末に引き継ぐ</summary>
        <p class="acct-p">メールアドレスを入れると、届いたリンクからこの端末のストックとプロジェクトをつなげます。別の端末では、同じメールを入れて届いたリンクを開いてください。</p>
        <form class="acct-f"><input type="email" required placeholder="you@example.com" autocomplete="email" aria-label="メールアドレス">
        <button name="link">この端末をつなぐ</button><button name="login" class="sub">別の端末から開く</button></form>
        <p class="acct-p" aria-live="polite"></p></details>`;
      const f = el.querySelector("form"), msg = el.querySelectorAll(".acct-p")[1];
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = f.querySelector("input").value.trim(), mode = e.submitter?.name;
        msg.textContent = "送っています…";
        const redirect = location.origin + location.pathname;
        const r = mode === "login"
          ? await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
          : await sb.auth.updateUser({ email }, { emailRedirectTo: redirect });
        if (mode === "login" && !r.error) { setMeta({}); sessionStorage.removeItem("tane-pulled") }
        msg.textContent = r.error ? "送れませんでした。アドレスを確かめて、もう一度押してください。" : "メールを送りました。届いたリンクを開いてください。";
      });
    });
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  if (ON) addEventListener("DOMContentLoaded", () => boot().catch(() => {}));
})();
