export type Event =
  | {
      type: "START";
    }
  | {
      type: "END";
      success: boolean;
    }
  | { type: "CHANGE" };
