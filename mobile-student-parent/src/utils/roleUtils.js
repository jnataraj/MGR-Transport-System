export const normalizeRole = (role) => {
  const value = (role || "").toLowerCase();
  if (value === "deptadmin" || value === "hod") return "hod";
  if (value === "parent") return "parent";
  return "student";
};

export const isStudent = (role) => normalizeRole(role) === "student";
export const isParent = (role) => normalizeRole(role) === "parent";
export const isHod = (role) => normalizeRole(role) === "hod";
