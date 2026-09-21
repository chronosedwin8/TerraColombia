<script setup lang="ts">
/**
 * Creación de cuenta.
 *
 * Se pide lo mínimo: nombre, correo y contraseña (y opcionalmente el nombre de la
 * organización). No se piden datos que el producto no necesite: la Ley 1581 de 2012 obliga a
 * pedir solo lo pertinente, y este producto es territorial, no de personas.
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { DISCLAIMERS } from '@terracolombia/shared';
import { useAuthStore } from '@/stores/auth';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseField from '@/components/ui/BaseField.vue';

const router = useRouter();
const auth = useAuthStore();

const name = ref('');
const email = ref('');
const password = ref('');
const organizationName = ref('');
const acceptedTerms = ref(false);

/** Fuerza de la contraseña, explicada en palabras y no con una barra de colores sin texto. */
const passwordHint = computed(() => {
  const value = password.value;
  if (value.length === 0) return 'Mínimo 10 caracteres.';
  if (value.length < 10) return 'Muy corta: faltan caracteres para llegar a 10.';
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((re) => re.test(value)).length;
  if (variety <= 2) return 'Aceptable. Mezclar mayúsculas, números y símbolos la hace más segura.';
  return 'Buena combinación de caracteres.';
});

const canSubmit = computed(
  () =>
    name.value.trim().length >= 2 &&
    email.value.includes('@') &&
    password.value.length >= 10 &&
    acceptedTerms.value,
);

async function submit(): Promise<void> {
  const ok = await auth.register({
    name: name.value.trim(),
    email: email.value.trim(),
    password: password.value,
    ...(organizationName.value.trim().length > 0
      ? { organizationName: organizationName.value.trim() }
      : {}),
  });
  if (ok) await router.replace('/');
}
</script>

<template>
  <div class="mx-auto max-w-md p-3">
    <BaseCard title="Crear cuenta" :heading-level="1">
      <form class="space-y-3" @submit.prevent="submit">
        <BaseField label="Tu nombre" required>
          <template #default="{ id }">
            <input :id="id" v-model="name" class="tc-input" autocomplete="name" required />
          </template>
        </BaseField>

        <BaseField label="Correo electrónico" required>
          <template #default="{ id }">
            <input
              :id="id"
              v-model="email"
              type="email"
              class="tc-input"
              autocomplete="email"
              required
            />
          </template>
        </BaseField>

        <BaseField label="Contraseña" :hint="passwordHint" required>
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              v-model="password"
              type="password"
              class="tc-input"
              autocomplete="new-password"
              minlength="10"
              required
              :aria-describedby="describedBy"
            />
          </template>
        </BaseField>

        <BaseField
          label="Organización (opcional)"
          hint="Si la indicas, creamos un espacio de equipo para compartir proyectos."
        >
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              v-model="organizationName"
              class="tc-input"
              :aria-describedby="describedBy"
            />
          </template>
        </BaseField>

        <label class="flex items-start gap-2 text-sm">
          <input
            v-model="acceptedTerms"
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-brand-600"
            required
          />
          <span>
            Acepto los términos de uso y la política de tratamiento de datos, y entiendo que
            TerraColombia entrega indicadores territoriales, no avalúos ni conceptos jurídicos.
          </span>
        </label>

        <p v-if="auth.error" class="text-sm font-medium text-rose-800" role="alert">
          {{ auth.error.message }}
        </p>

        <BaseButton type="submit" block :loading="auth.isSubmitting" :disabled="!canSubmit">
          Crear mi cuenta
        </BaseButton>
      </form>

      <p class="mt-4 text-sm">
        ¿Ya tienes cuenta?
        <RouterLink class="tc-link" to="/ingresar">Ingresar</RouterLink>
      </p>

      <ul class="mt-4 space-y-1 text-xs text-slate-500">
        <li>{{ DISCLAIMERS.noPersonalData }}</li>
        <li>{{ DISCLAIMERS.notAppraisal }}</li>
      </ul>
    </BaseCard>
  </div>
</template>
