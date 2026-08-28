import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const redirectTo = window.location.origin + import.meta.env.BASE_URL;

export async function signInWithEntra() {
  return supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes: "openid email profile", redirectTo },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args || {});
  if (error) throw new Error(error.message);
  return data;
}

export const api = {
  myProgress: () => rpc("my_progress"),
  confirmRead: (moduleId, value = true) => rpc("confirm_read", { p_module: moduleId, p_value: value }),
  getQuiz: (moduleId) => rpc("get_quiz", { p_module: moduleId }),
  submitQuiz: (moduleId, answers) => rpc("submit_quiz", { p_module: moduleId, p_answers: answers }),
  trainerOverview: () => rpc("trainer_overview"),
  confirmSession: (userId, sessionId, value = true) =>
    rpc("confirm_session", { p_user: userId, p_session: sessionId, p_value: value }),
};

export async function loadProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth || !auth.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, is_trainer")
    .eq("id", auth.user.id)
    .maybeSingle();
  return data || { id: auth.user.id, email: auth.user.email, display_name: auth.user.email, is_trainer: false };
}
