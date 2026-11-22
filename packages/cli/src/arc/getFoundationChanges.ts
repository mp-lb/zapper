import { getResourceChanges } from "./getResourceChanges";

// Project modules form the operator-managed foundation, independently of cloud.
export const getFoundationChanges = (plan: unknown) =>
  getResourceChanges(plan).filter(({ address }) =>
    /^module\.prj_(?:ci|gcp|registry|budget)(?:\[.*?\])?\./.test(address),
  );
