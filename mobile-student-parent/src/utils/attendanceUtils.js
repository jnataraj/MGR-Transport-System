import { STAGE, STAGE_META } from "../constants/attendanceStages";

export const getStageLabel = (stage) =>
  STAGE_META[stage]?.label || stage || "—";

export const getLegStops = (stage) => {
  const morning = stage === STAGE.PICKUP || stage === STAGE.TO_COLLEGE;
  return morning
    ? [
        { key: STAGE.PICKUP, label: "PICKUP" },
        { key: STAGE.TO_COLLEGE, label: "IN-ROUTE" },
        { key: STAGE.AT_COLLEGE, label: "COLLEGE" },
      ]
    : [
        { key: STAGE.AT_COLLEGE, label: "COLLEGE" },
        { key: STAGE.TO_HOME, label: "IN-ROUTE" },
        { key: STAGE.AT_HOME, label: "HOME" },
      ];
};
