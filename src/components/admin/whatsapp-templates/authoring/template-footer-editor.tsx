"use client";
import { TemplateInlineEditor } from "./template-inline-editor";
import type { AuthoringIssue, SemanticVariable, WrapperNode } from "@/lib/admin/whatsapp-templates/authoring/types";
export function TemplateFooterEditor({ nodes, onChange, variables = [], issues = [], helpText }: {
  nodes: WrapperNode[]; onChange: (nodes: WrapperNode[]) => void;
  variables?: readonly SemanticVariable[]; issues?: AuthoringIssue[]; helpText?: string;
}) {
  return <TemplateInlineEditor title="Footer" nodes={nodes} onChange={onChange} variables={variables} issues={issues}
    helpText={helpText ?? "Optional short sign-off under the main message."} />;
}
