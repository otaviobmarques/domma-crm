"use client";
import { use } from "react";
import { BoardPage } from "@/components/board/BoardPage";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BoardPage key={id} id={id} />;
}
