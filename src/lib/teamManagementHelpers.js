export const roleLabel = (role) =>
  String(role || "user")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

export const approvalLabel = (status) =>
  String(status || "draft")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

export const getRoleBadgeClass = (role) => {
  switch (role) {
    case "owner":
      return "border border-amber-200 bg-amber-50 text-amber-700";
    case "admin":
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    case "sub_admin":
      return "border border-sky-200 bg-sky-50 text-sky-700";
    case "reviewer":
      return "border border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
};

export const getMemberStatusBadgeClass = (status) => {
  switch (status) {
    case "active":
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    case "invited":
      return "border border-amber-200 bg-amber-50 text-amber-700";
    case "disabled":
      return "border border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
};

export const getApprovalBadgeClass = (status) => {
  switch (status) {
    case "approved":
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    case "pending_approval":
      return "border border-amber-200 bg-amber-50 text-amber-700";
    case "changes_requested":
      return "border border-sky-200 bg-sky-50 text-sky-700";
    case "rejected":
      return "border border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
};

export const canActorInviteRole = (actorRole, targetRole) => {
  if (actorRole === "owner") return targetRole !== "owner";
  if (actorRole === "admin") return targetRole === "user";
  return false;
};

export const isValidApprovalTransition = (fromStatus, action) => {
  if (fromStatus !== "pending_approval") return false;
  return action === "approved" || action === "rejected" || action === "changes_requested";
};

export const normalizeTeamErrorMessage = (error) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error?.message || error?.details || "Unexpected error");

  const lowered = message.toLowerCase();
  if (lowered.includes("sender allocation exceeds the remaining capacity of the parent admin")) {
    return "Max sender accounts exceeds the selected parent admin's remaining sender capacity. Lower the sender allocation or choose a different parent admin.";
  }
  if (lowered.includes("outside of your scope")) return "That member is outside of your scope.";
  if (lowered.includes("not authorized")) return "You do not have permission for that action.";
  if (lowered.includes("non-2xx status code")) return "The request failed. Check the form values and try again.";
  if (lowered.includes("approval")) return message;
  if (lowered.includes("allocation")) return message;
  if (lowered.includes("limit")) return message;
  return message;
};
