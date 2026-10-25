"use client";
import { TemplateInlineEditor } from "./template-inline-editor";
import type { AuthoringIssue, SemanticVariable, WrapperNode } from "@/lib/admin/whatsapp-templates/authoring/types";
export function TemplateHeaderEditor({ nodes, onChange, variables = [], issues = [], helpText }: {
  nodes: WrapperNode[]; onChange: (nodes: WrapperNode[]) => void;
  variables?: readonly SemanticVariable[]; issues?: AuthoringIssue[]; helpText?: string;
}) {
  return <TemplateInlineEditor title="Header" nodes={nodes} onChange={onChange} variables={variables} issues={issues}
    helpText={helpText ?? "Optional heading above the main message."} />;
}
