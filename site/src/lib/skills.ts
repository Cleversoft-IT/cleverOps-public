// Catalogo generato da scripts/generate-skills.mjs (predev/prebuild/pretypecheck) a partire
// da ../cleverops.json: il file non è versionato. Nessun componente deve citare skill per nome.
import data from "../../data/skills.generated.json";

export type Skill = {
  name: string;
  description: string;
  category: string;
  legacy: boolean;
  targets: string[];
  command: string;
};

export type Agent = {
  name: string;
  description: string;
  category: string;
  targets: string[];
  command: string;
};

export type CatalogData = {
  repo: string;
  counts: { skills: number; agents: number };
  categories: string[];
  skills: Skill[];
  agents: Agent[];
};

export const catalog = data as CatalogData;

/** Il manifest pubblico può non avere agent: in quel caso sezione, voce di menu e testi spariscono. */
export const hasAgents = catalog.agents.length > 0;

/** "skill, agent e tool" oppure "skill e tool", secondo il catalogo. */
export const offerLabel = hasAgents ? "skill, agent e tool" : "skill e tool";

/** Come `offerLabel`, con l'iniziale maiuscola (inizio frase). */
export const offerLabelSentence = offerLabel.charAt(0).toUpperCase() + offerLabel.slice(1);
