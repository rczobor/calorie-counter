export const isE2eMockMode =
  import.meta.env.VITE_E2E_MOCKS?.toLowerCase() === 'true'
