# Prompt 03 — Fleet and document upload

**Prerequisites:** prompts 01–02; migrations `..._fleet.sql`,
`..._documents_compliance.sql`, `..._storage_notifications_cron.sql` applied;
edge function `parse-document` deployed.

This is the core of the product. Take it in two messages if Lovable struggles:
files 1–4 first, then 5–8.

---

## Lovable prompt

```
Add fleet management and compliance document upload. Create only the files
listed. Do NOT modify existing components except the two noted at the end.

CREATE

1. src/hooks/useVehicles.ts
   Query vehicles for the current company. Mutations: addVehicle, updateVehicle,
   deactivateVehicle (sets is_active false - never hard delete, documents hang off it).

2. src/hooks/useDocuments.ts
   Query documents for the current company with optional filters
   { scope, vehicleId, driverId }. Also expose a query over the view
   v_company_missing_documents and v_vehicle_missing_documents so the UI can
   show what is still owed.
   Mutations:
   - uploadDocument({ file, kind, scope, vehicleId }):
       a) upload to the "documents" storage bucket at path
          `${companyId}/${crypto.randomUUID()}.${ext}`
       b) insert the documents row with status "uploaded", file_path, file_mime,
          file_size_bytes, uploaded_by
       c) invoke the "parse-document" edge function with { document_id }
       d) invalidate the documents query
     If the edge function fails, do NOT roll back the upload - the document is
     stored and an admin can still review it. Show a warning toast instead:
     "Documentul a fost încărcat. Citirea automată a eșuat, îl verificăm manual."
   - deleteDocument(id): remove the storage object, then the row.

3. src/components/documents/DocumentUploadCard.tsx
   Props: { kind, label, scope, vehicleId?, document? }
   Renders one required document as a card:
   - no document       -> dashed drop zone, "Încarcă {label}"
   - uploaded/parsing  -> spinner, "Se citește documentul..."
   - pending           -> blue badge "În verificare", shows the extracted
                          valid_until as "Expiră la {dd.MM.yyyy}"
   - approved          -> green badge "Valid până la {dd.MM.yyyy}".
                          Under 30 days left: amber "Expiră în {n} zile".
                          Expired: red "Expirat la {dd.MM.yyyy}" + "Încarcă document nou".
   - rejected          -> red badge, shows rejection_reason, "Încarcă din nou"
   Accepts PDF, JPG, PNG, WEBP up to 10 MB. Validate both before uploading and
   show a Romanian message on failure.

4. src/components/documents/DocumentChecklist.tsx
   Props: { scope: "company" | "vehicle", vehicleId? }
   Reads the matching missing-documents view and renders one
   DocumentUploadCard per requirement, blocking ones first.
   Header shows progress: "3 din 5 documente încărcate".

5. src/components/fleet/VehicleForm.tsx
   Dialog form: plate_number (uppercase, no spaces, required), vin, make, model,
   year, vehicle_type (select using VEHICLE_TYPE_LABELS), max_weight_kg,
   length_m, width_m, height_m, volume_m3, pallet_capacity, and switches for
   has_adr, has_tail_lift, has_gps, has_frigo. Zod validation, Romanian messages.

6. src/components/fleet/VehicleCard.tsx
   Shows plate, type, capacity, and a compliance badge driven by is_compliant:
   green "Documente valide" or red "Documente lipsă/expirate".
   Clicking it expands a DocumentChecklist for that vehicle.

7. src/pages/Fleet.tsx at route /flota
   List of VehicleCard with an "Adaugă mașină" button. Empty state:
   "Nu ai nicio mașină înregistrată. Adaugă prima ca să poți posta pe bursă."

8. src/pages/Documents.tsx at route /documente
   Two sections: "Documentele firmei" (DocumentChecklist scope="company")
   and "Documentele mașinilor" (one collapsible block per vehicle).
   At the top, a summary card: how many documents are valid, how many expire
   in the next 30 days, how many are expired.

MODIFY

9. src/components/layout/AppShell.tsx
   Add "Flota mea" -> /flota and "Documente" -> /documente to the sidebar.
   Show a red dot next to "Documente" when anything is expired or missing.
   Do NOT change anything else in this file.

IMPORTANT
The storage path MUST start with the company id - the RLS policy on
storage.objects reads the first folder segment as the company id. A path
without it will upload and then be unreadable.
```

---

## Verification checklist

- [ ] Upload an ITP photo → row appears with `status = 'uploaded'`, then
      `'pending'` with `valid_until` filled in
- [ ] The extracted date matches the document
- [ ] Upload a PDF → same result (document block, not image block)
- [ ] Upload a 15 MB file → rejected client-side with a Romanian message
- [ ] Upload a `.docx` → rejected
- [ ] Storage path looks like `<company-uuid>/<doc-uuid>.jpg`
- [ ] A second company cannot download the file: signed URL from another
      account returns 403
- [ ] Deactivating a vehicle keeps its documents
- [ ] The checklist shows exactly the requirements matching the company type —
      a forwarder must not be asked for a `licență comunitară`
- [ ] A vehicle under 3.5 t is not asked for a `copie conformă`
- [ ] Red dot appears on "Documente" when something expires

**Common failure:** upload works, reading back gives 403. The path is missing
the company-id prefix. Check `useDocuments.uploadDocument`.
