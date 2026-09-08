import type { Metadata } from "next";
import { SkillsLibrary } from "@/components/assistant-ui/skills-library";

export const metadata: Metadata = {
  title: "Skills — Nullain Agent",
  description: "Gerencie as habilidades disponíveis para o Nullain Agent.",
};

export default function SkillsPage() {
  return <SkillsLibrary />;
}
