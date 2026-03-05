import { Handler } from "../types/lambda";
import { Facility, ResultSummary } from "../types/contracts";
import { json } from "../utils/http";

export const healthGet: Handler = async () => json(200, { status: "ok" });

export const classesGet: Handler = async () =>
  json(200, { classes: ["Class 1", "Class 2", "Class 3"] });

export const facilitiesGet: Handler = async () => {
  const facilities: Facility[] = [
    { title: "Library", description: "Well-stocked library" },
    { title: "Science Lab", description: "Physics, chemistry and biology labs" }
  ];

  return json(200, { facilities });
};

export const resultsSummaryGet: Handler = async () => {
  const results: ResultSummary[] = [
    { year: "2025", passRate: "96%", distinction: 42, merit: 17 }
  ];

  return json(200, { results });
};
