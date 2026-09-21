/**
 * "Compartir enlace" y "Exportar" de la barra fija de resultados (PLAN.md §10.1).
 * Copiar al portapapeles puede fallar en contextos no seguros, así que siempre hay
 * un camino alternativo visible (el propio enlace en un campo seleccionable).
 */
import { ref } from 'vue';

export function useShare() {
  const copied = ref(false);
  const failed = ref(false);

  async function copy(text: string): Promise<boolean> {
    failed.value = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Respaldo para http:// y navegadores sin permiso de portapapeles.
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (!ok) throw new Error('copy command rejected');
      }
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2500);
      return true;
    } catch {
      failed.value = true;
      return false;
    }
  }

  /** Comparte por la hoja nativa del sistema en móvil; cae a copiar en escritorio. */
  async function share(payload: { title: string; text?: string; url: string }): Promise<void> {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // El usuario canceló o el navegador lo rechazó: se copia en su lugar.
      }
    }
    await copy(payload.url);
  }

  /** Dispara la descarga de un Blob ya obtenido del API. */
  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Liberar el objeto en el siguiente tick: Safari necesita que siga vivo durante el clic.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { copied, failed, copy, share, downloadBlob };
}
