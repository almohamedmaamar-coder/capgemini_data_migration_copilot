import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";

/**
 * DÉMO UNIQUEMENT — classeur 2 feuilles avec violations R1/R2/R3 injectées.
 * Supprimer ce fichier dès qu'un vrai template est disponible.
 */

function mulberry(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_FILE_NAME = "Démo_Profit_Center.xlsx";

export function buildDemoWorkbook(): WorkBook {
  const rnd = mulberry(20240917);
  const keys: string[] = [];
  for (let i = 0; i < 40; i++) keys.push(`PC${1000 + i}`);

  const master: (string | number)[][] = [
    ["Profit Center*", "Description*", "Controlling Area*", "Valid From", "Person Responsible"],
  ];
  keys.forEach((k, i) => {
    master.push([
      k,
      i === 7 ? "" : `Centre ${1000 + i}`, // R1 : description vide
      "1000",
      "01.01.2024",
      `RESP${1 + Math.floor(rnd() * 5)}`,
    ]);
  });
  master.push(["PC1005", "Doublon volontaire", "1000", "01.01.2024", "RESP1"]); // R3
  // PC1039 n'a aucune affectation → warning R2 (orphelin)

  const assign: (string | number)[][] = [
    ["Profit Center*", "Company Code*", "Valid From*"],
  ];
  keys.slice(0, 39).forEach((k) => {
    assign.push([k, k === "PC1001" ? "1000" : `${1000 + Math.floor(rnd() * 3)}`, "01.01.2024"]);
  });
  assign.push(["PC9999", "1000", "01.01.2024"]); // R2 : clé inconnue
  assign.push(["PC1001", "1000", "01.01.2024"]); // R3 : ligne en double
  assign.push(["PC1002", "", "01.01.2024"]); // R1 : société vide

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(master), "Master Record");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(assign), "Company Code Assignment");
  return wb;
}
