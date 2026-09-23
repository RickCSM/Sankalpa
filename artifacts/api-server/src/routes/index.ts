import { Router, type IRouter } from "express";
import authRouter from "./auth";
import profilePhotoRouter from "./profilePhoto";
import usersRouter from "./users";
import preferencesRouter from "./preferences";
import directoryRouter from "./directory";
import masterDataRouter from "./master-data";
import announcementsRouter from "./announcements";
import notificationsRouter from "./notifications";
import storageRouter from "./storage";
import attachmentsRouter from "./attachments";
import auditRouter from "./audit";
import adminRouter from "./admin";
import uoiNotesRouter from "./uoi-notes";
import uoiNoteAttachmentsRouter from "./uoi-note-attachments";

const router: IRouter = Router();

router.use(authRouter);
router.use(profilePhotoRouter);

// storageRouter must be mounted before any router that calls
// `router.use(requireAuth)` globally (e.g. usersRouter, announcementsRouter).
// Those routers have no mount-path prefix, so their requireAuth middleware runs
// for every /api/* request that reaches them — which would otherwise reject the
// genuinely public GET /storage/public-objects/* route with 401 before it could
// be served. The authenticated storage routes keep their own per-route
// requireAuth, so mounting earlier does not weaken them.
router.use(storageRouter);

router.use(usersRouter);
router.use(preferencesRouter);
router.use(directoryRouter);
router.use(masterDataRouter);
router.use(announcementsRouter);
router.use(notificationsRouter);
router.use(attachmentsRouter);
router.use(auditRouter);
router.use(adminRouter);
router.use(uoiNotesRouter);
router.use(uoiNoteAttachmentsRouter);

export default router;
