/** Browser-safe acceptance compilation: no I/O, HTTP runner or native diff. */
export {
  projectAcceptanceTests,
  type AcceptanceProjection,
  type AcceptanceFlow,
  type AcceptanceStep,
} from './delivery/scenarioProjector.js';
