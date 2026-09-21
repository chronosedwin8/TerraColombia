/** Tipos de los componentes de aplicación (fuera de los SFC, que no admiten exportaciones). */

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  /** false bloquea el botón "Continuar". */
  canContinue?: boolean;
  /** Por qué está bloqueado, en lenguaje claro. */
  blockedReason?: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  /** Segundos estimados del paso; los cuatro pasos suman ~60 s. */
  seconds: number;
  /** Ejemplo precargado que el paso ofrece abrir. */
  example?: { label: string; to: string };
}
