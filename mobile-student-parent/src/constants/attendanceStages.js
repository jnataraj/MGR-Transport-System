export const STAGE = {
  PICKUP: "PICKUP",
  TO_COLLEGE: "TO_COLLEGE",
  AT_COLLEGE: "AT_COLLEGE",
  TO_HOME: "TO_HOME",
  AT_HOME: "AT_HOME",
};

export const STAGE_META = {
  [STAGE.PICKUP]: { label: "WAITING FOR\nMORNING PICKUP", icon: "📷", color: "#F59E0B" },
  [STAGE.TO_COLLEGE]: { label: "ONGOING:\nTRANSIT TO COLLEGE", icon: "🚌", color: "#10B981" },
  [STAGE.AT_COLLEGE]: { label: "ARRIVED:\nCOLLEGE", icon: "🏫", color: "#2563EB" },
  [STAGE.TO_HOME]: { label: "ONGOING:\nTRANSIT BACK HOME", icon: "🚌", color: "#10B981" },
  [STAGE.AT_HOME]: { label: "ARRIVED:\nHOME DESTINATION", icon: "🏡", color: "#475569" },
};

export const NEXT_STAGE = {
  [STAGE.PICKUP]: STAGE.TO_COLLEGE,
  [STAGE.TO_COLLEGE]: STAGE.AT_COLLEGE,
  [STAGE.AT_COLLEGE]: STAGE.TO_HOME,
  [STAGE.TO_HOME]: STAGE.AT_HOME,
  [STAGE.AT_HOME]: STAGE.PICKUP,
};

export const isTransitStage = (stage) =>
  stage === STAGE.TO_COLLEGE || stage === STAGE.TO_HOME;
