// Supabase の公開できる値だけを書く（anon key は公開してよい鍵。秘密の鍵は絶対に書かない）
// 空のままなら、アプリは端末の中だけで動き、AIのボタンは出ない。
window.TANE_CONFIG = {
  supabaseUrl: "",
  anonKey: "",
};
