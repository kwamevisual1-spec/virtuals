"use client";
import { useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
export function AgentLogin() {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const form=new FormData(e.currentTarget);
    try {
      const res=await fetch("/api/auth/signin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:String(form.get("email")).trim(),password:form.get("password")})});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error || "Sign in failed");
      if(!String(data.nextPath).startsWith("/agent?")) throw new Error("This account is not an active agent.");
      if(data.session) sessionStorage.setItem("vp_session",JSON.stringify(data.session));
      window.location.replace(data.nextPath);
    } catch(e) {setError(e instanceof Error?e.message:"Sign in failed");setBusy(false);}
  }
  return <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-7 shadow-lg"><label className="block text-sm font-bold">Email<input required type="email" name="email" autoComplete="username" className="mt-2 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-red-500" placeholder="agent@example.com"/></label><label className="block text-sm font-bold">Password<input required type="password" name="password" autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-red-500"/></label>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="btn-primary !h-12 !text-sm">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<LockKeyhole className="h-4 w-4"/>} Sign in to Agent Portal</button></form>;
}
