"use client";
import { TemplateInlineEditor } from "./template-inline-editor";
import type { AuthoringIssue, SemanticVariable, WrapperNode } from "@/lib/admin/whatsapp-templates/authoring/types";
export function TemplateBodyEditor({ nodes, onChange, variables = [], allowResponseSlot = false, issues = [] }: {
  nodes: WrapperNode[]; onChange: (nodes: WrapperNode[]) => void;
  variables?: readonly SemanticVariable[]; allowResponseSlot?: boolean; issues?: AuthoringIssue[];
}) {
  return <TemplateInlineEditor title="Body" rows={6} nodes={nodes} onChange={onChange} variables={variables}
    allowResponseSlot={allowResponseSlot} issues={issues}
    helpText="Use Insert variable to add typed values where the cursor is. Do not enter raw Meta numbered placeholders." />;
}
