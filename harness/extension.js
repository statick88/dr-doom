import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { createReceiptRegistry, decideToolCall, issueReceipt, runRestrictedLab, validateHostApproval } from "./policy.js";

const defaultWorkspaceRoot = new URL("./lab-workspace/", import.meta.url).pathname;

export function createHarnessExtension({ registry = createReceiptRegistry(), workspaceRoot = defaultWorkspaceRoot, runLab = runRestrictedLab } = {}) {
  const labTool = defineTool({
    name: "lab_exec",
    label: "Restricted local lab",
    description: "Run bounded argv only in a pre-existing digest-pinned Docker image and dedicated isolated lab workspace. No network, pulls, builds, host mounts, or privileged/kernel tests.",
    parameters: Type.Object({
      image: Type.String({ description: "Locally present image exactly as name@sha256:<64 hex>." }),
      command: Type.Array(Type.String(), { minItems: 1, maxItems: 32, description: "Command argv; never a shell string." }),
      workspace: Type.String({ description: "Existing directory under the dedicated lab workspace." }),
    }),
    async execute(_id, params) {
      const result = await runLab({ ...params, workspaceRoot });
      const issued = await issueReceipt(registry, result);
      const receipt = issued.allow ? ` Receipt: ${issued.receipt.id}.` : "";
      const status = result.allow ? `Lab command completed; exit zero proves execution only, not exploit efficacy.${receipt}` : `Lab command unavailable or rejected: ${result.reason ?? "non-zero exit or timeout"}`;
      return { content: [{ type: "text", text: `${status}\n${result.output ?? ""}`.slice(0, 16 * 1024) }], details: { ...result, receipt: issued.allow ? issued.receipt : undefined } };
    },
  });

  return function (pi) {
    pi.registerTool(labTool);
    pi.on("tool_call", async (event, ctx) => {
      const initial = decideToolCall({ toolName: event.toolName, hasUI: ctx.hasUI });
      if (event.toolName !== "bash") return initial.allow ? undefined : { block: true, reason: initial.reason };
      if (!ctx.hasUI) return { block: true, reason: initial.reason };
      const entered = await ctx.ui.input("Host shell approval details", "JSON exactly: {target,scope,evidence receipt ID}");
      let declared;
      try { declared = JSON.parse(entered ?? ""); } catch { return { block: true, reason: "Host shell blocked: approval details must be JSON." }; }
      if (!declared || Object.keys(declared).length !== 3 || !["target", "scope", "evidence"].every((key) => Object.hasOwn(declared, key))) return { block: true, reason: "Host shell blocked: approval JSON must contain only target, scope, and evidence." };
      const approval = await validateHostApproval({ command: event.input.command, cwd: ctx.cwd, ...declared, registry });
      if (!approval.allow) return { block: true, reason: approval.reason };
      const confirmed = await ctx.ui.confirm("Approve exact host command?", JSON.stringify({ ...JSON.parse(approval.payload), receipt: approval.receipt }));
      const decision = decideToolCall({ toolName: "bash", hasUI: true, approved: confirmed });
      if (!decision.allow) return { block: true, reason: decision.reason };
      const finalApproval = await validateHostApproval({ command: event.input.command, cwd: ctx.cwd, ...declared, registry, consume: true });
      return finalApproval.allow ? undefined : { block: true, reason: finalApproval.reason };
    });
  };
}

export default createHarnessExtension();
