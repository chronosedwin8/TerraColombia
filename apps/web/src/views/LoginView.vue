<script setup lang="ts">
/**
 * Ingreso. Tras iniciar sesión se vuelve a `?redirect=`, que es la ruta que la guarda del
 * router guardó al bloquear la navegación.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { requestPasswordReset } from '@/api/auth';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseField from '@/components/ui/BaseField.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const resetSent = ref(false);

const redirect = computed(() => {
  const value = route.query['redirect'];
  return typeof value === 'string' ? value : '/';
});

const canSubmit = computed(() => email.value.includes('@') && password.value.length >= 8);

async function submit(): Promise<void> {
  const ok = await auth.login(email.value.trim(), password.value);
  if (ok) await router.replace(redirect.value);
}

async function sendReset(): Promise<void> {
  if (!email.value.includes('@')) return;
  await requestPasswordReset(email.value.trim());
  // Se responde igual exista o no la cuenta: no se filtra qué correos están registrados.
  resetSent.value = true;
}
</script>

<template>
  <div class="mx-auto max-w-md p-3">
    <BaseCard title="Ingresar a TerraColombia" :heading-level="1">
      <form class="space-y-3" @submit.prevent="submit">
        <BaseField label="Correo electrónico" required>
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              v-model="email"
              type="email"
              autocomplete="email"
              class="tc-input"
              required
              :aria-describedby="describedBy"
            />
          </template>
        </BaseField>

        <BaseField label="Contraseña" hint="Mínimo 8 caracteres" required>
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="tc-input"
              required
              minlength="8"
              :aria-describedby="describedBy"
            />
          </template>
        </BaseField>

        <p v-if="auth.error" class="text-sm font-medium text-rose-800" role="alert">
          {{ auth.error.message }}
        </p>

        <BaseButton type="submit" block :loading="auth.isSubmitting" :disabled="!canSubmit">
          Ingresar
        </BaseButton>
      </form>

      <div class="mt-4 space-y-2 text-sm">
        <p>
          ¿No tienes cuenta?
          <RouterLink class="tc-link" to="/registro">Crear una</RouterLink>
        </p>
        <p v-if="!resetSent">
          <button type="button" class="tc-link" @click="sendReset">
            Olvidé mi contraseña
          </button>
        </p>
        <p v-else class="text-slate-600" role="status">
          Si ese correo tiene cuenta, le enviamos un enlace para restablecer la contraseña.
        </p>
      </div>

      <p class="mt-4 text-xs text-slate-500">
        Puedes usar el mapa, las capas de contexto y la ficha básica de un predio sin cuenta. La
        sesión hace falta para búsquedas avanzadas, análisis de zona, informes y la API.
      </p>
    </BaseCard>
  </div>
</template>
