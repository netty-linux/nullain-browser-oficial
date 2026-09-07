import type { Metadata } from "next";
import { PluginsMarketplace } from "@/components/assistant-ui/plugins-marketplace";

export const metadata: Metadata = {
  title: "Plugins — Nullain Agent",
  description: "Explore e conecte suas ferramentas à Nullain.",
};

export default function PluginsPage() {
  return <PluginsMarketplace />;
}
