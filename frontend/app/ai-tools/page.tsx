"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AiToolsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/screening");
  }, [router]);
  return null;
}
