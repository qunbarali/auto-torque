# Auto Torque — User Guide

This guide describes the main workflows and safe operating practices for Auto Torque. The exact navigation labels and available actions can vary with application version, account role, organization settings, deployment mode, and enabled integrations.

## 1. First sign-in and setup

1. Start Auto Torque using the URL or desktop application supplied by your administrator.
2. Sign in with your account. If account creation is enabled, follow the registration flow and complete any required verification.
3. Confirm your organization/workshop and role. Ask an administrator to correct access if the expected modules are missing.
4. Open the settings area and review workshop details, locale, currency, tax defaults, invoice/quote preferences, and other operational defaults available in your deployment.
5. Configure email, payment, messaging, or AI providers only if your workshop intends to use them. A button for an external integration may require valid server-side credentials before it can complete an action.
6. Create a backup plan before entering production records.

**Administrator note:** this application supports organization membership, roles and permissions, invitations, system settings, and audit logs. Give users only the access they need.

## 2. Recommended daily workflow

A typical workshop workflow is:

1. Find an existing customer or create a new customer record.
2. Find the customer's vehicle or register it, linking it to the correct customer.
3. Record the service request, inspection findings, or customer concern.
4. Create a service record/work order with a clear description, dates/status, assigned technician when applicable, labor, parts, and any notes or attachments.
5. Record the work performed and update status as the job progresses.
6. Create a quote when approval is required. Confirm the customer, vehicle, line items, tax, discounts, and validity before sharing it.
7. Create or finalize the invoice/payment record according to the workflow configured by your workshop.
8. Update inventory movements for parts consumed or received.
9. Schedule reminders or follow-up communication where configured.
10. Review reports and outstanding work at the end of the day.

Do not assume that opening a dialog or clicking a button means a record was saved. Wait for the application's success/error feedback and verify important changes in the relevant record or list.

## 3. Customers

Use the customer area to maintain contact details and customer history.

- **Create:** enter the customer identity and the contact information required by your workshop, then save.
- **Find:** use the available search and filters before creating a duplicate.
- **Update:** open the existing record, change the necessary fields, and save.
- **History:** inspect related vehicles, service records, quotes, invoices/payments, and communications when those sections are available.
- **Privacy:** enter only information needed to operate the workshop. Restrict exports and access to customer data.

Before deleting or merging any record, check whether it is referenced by vehicles, jobs, quotes, invoices, or other records. Prefer an archive/inactive workflow when the UI offers one and retention is required.

## 4. Vehicles and service history

1. Search by customer, registration/plate, VIN, make, or model using the fields available in the current screen.
2. If the vehicle is new to the system, create it and select the correct customer.
3. Enter accurate make, model, year, mileage, and optional identifiers/specifications.
4. Review existing service records, notes, fuel logs, reminders, inspections, and findings before starting a new job.
5. Update mileage only from a reliable reading and include notes when a correction is needed.

A vehicle may have related jobs, reminders, quotes, recurring invoices, inspections, and tire records. Keep the customer/vehicle relationship correct before creating downstream documents.

## 5. Service jobs and work orders

Use service records/work orders to document the job, labor, parts, findings, and costs.

- Enter a specific job title and description.
- Select the correct customer and vehicle when relevant. Some counter/parts-only jobs may not require a vehicle.
- Set status, service date, mileage, assigned technician, and start/end times when supported by the form.
- Add diagnostic notes and customer-facing notes in the appropriate fields.
- Add labor and parts as separate line items when the UI supports them.
- Check subtotal, tax, discount, and total before saving or issuing an invoice.
- Attach images/documents only when they belong to that job and do not contain unrelated personal data.
- Update job status as work moves through the workshop process.

For warranty work, record the warranty period/mileage and any conditions or notes. For jobs raised from an inspection, preserve the link so the inspection can show the follow-up work.

## 6. Quotes and customer approval

1. Start a quote for the correct customer and vehicle, if applicable.
2. Add the work, parts, labor, quantities, prices, taxes, and discounts.
3. Check validity dates and notes.
4. Review the total and customer details before sharing.
5. Use the available share/print/send action and verify that the intended output was created or delivered.
6. When approval or rejection is received, update the quote through the application's supported action and check its status.

A share button may generate a link or document rather than send an email. Email delivery requires a configured provider. Confirm the status or delivery feedback instead of assuming the recipient received it.

## 7. Invoices, payments, and recurring invoices

- Verify the customer, vehicle/job relationship, invoice number/date, due date, line items, tax settings, discounts, and total.
- Record payment only after confirming the amount, method, and date.
- Check outstanding balance and payment history after saving.
- Use recurring invoice settings only for an agreed recurring service. Confirm frequency, start/end dates, line items, and customer before enabling it.
- If payment processing is connected, verify the transaction with the payment provider as well as the app.

Do not record a payment twice because a provider response appears delayed. Refresh the record and check transaction history first.

## 8. Parts inventory

Use inventory to maintain part details and stock movement history.

- Add parts with a clear name/SKU and the relevant quantity, price, cost, and stock information available in the form.
- Record receipts, adjustments, and consumption using the dedicated stock-movement workflow.
- Verify stock quantity after a movement.
- Review low-stock information/reports if available.
- Investigate discrepancies before making a manual adjustment, and include an explanatory note where supported.

Avoid editing stock in multiple places at once. A service job's parts line and inventory movement may be separate concepts; follow the application's actual workflow and verify both job costing and stock on hand.

## 9. Inspections

1. Choose the appropriate inspection template when templates are available.
2. Identify the correct customer and vehicle.
3. Complete each applicable inspection item and record findings accurately.
4. Attach supporting images or notes where appropriate.
5. Review the report before sharing it with the customer.
6. Raise follow-up work or a quote through the supported action when defects require repair.
7. Confirm the inspection and any linked service job remain connected.

Never mark an item as passed merely to complete the form. If an item cannot be inspected, use the available not-applicable/notes workflow.

## 10. Tire storage / tire hotel

Where the tire-hotel module is enabled:

- Register the tire set and associate it with the correct customer/vehicle.
- Record tire identifiers, location/warehouse, measurements, and condition where supported.
- Use the movement workflow when tires change storage location or are returned to a customer.
- Record treatments and attachments against the correct set.
- Verify the stored set before booking a tire change or fitting appointment.

Accurate location and measurement records reduce the risk of fitting the wrong set or losing track of stored tires.

## 11. Technicians, team access, and mobile API

Administrators can manage team membership and technician access according to the configured roles and permissions. Use invitations or technician setup/login flows provided by the application rather than sharing an administrator's credentials.

If your deployment uses the technician mobile app/API:

- Give each technician their own credentials or setup code.
- Treat login codes and bearer/session tokens as secrets.
- Sign out or revoke access when a device is lost or a technician leaves.
- Use HTTPS for remote connections.
- Keep the server's API base URL and deployment settings consistent with the mobile client.

A web user account and a technician/mobile identity may be related but are not necessarily interchangeable. Follow the setup flow supplied by your administrator.

## 12. Two devices on the same Wi-Fi (one shared database)

**The main device is the database owner.** The second device must connect to the main device's running Auto Torque server; it must not start an independent desktop server and expect the two SQLite databases to merge. Same username/password on two separate local installations does not synchronize their databases.

### Set up the main device

1. Connect both devices to the same trusted private Wi-Fi network.
2. On the main Windows computer, run `ipconfig` and find the active Wi-Fi adapter's IPv4 address, for example `192.168.1.20`. A DHCP reservation in the router helps keep this address stable.
3. In Windows Defender Firewall, allow inbound TCP port 3000 on the **Private** profile only. Do not disable the firewall or forward port 3000 from your router to the internet.
4. Close Auto Torque if it is running. Launch the packaged desktop app from PowerShell with LAN hosting enabled. Replace the example address and executable path:
   
   ```powershell
   $env:AUTO_TORQUE_LAN_HOST = "true"
   $env:AUTO_TORQUE_LAN_ORIGINS = "http://192.168.1.20:3000"
   Start-Process "C:\Path\To\Auto Torque.exe"
   ```

   The environment variables must be inherited by the desktop executable; putting them only in `.env` does not configure the Rust desktop host. LAN mode remains disabled by default. If no valid exact origin is configured, the server refuses to start in LAN mode.

5. On the main device, open **Settings → LAN devices**. Enter the main device's LAN address (not `localhost`), select **Prepare QR code**, and save the QR image or copy the connection code. The address must match the origin configured for LAN access.
6. Keep the main computer awake and Auto Torque running whenever the second device needs access.

### Connect the secondary device

1. Connect the second device to the same private Wi-Fi.
2. Open the Auto Torque sign-in page served by the main device, or use **Login as secondary device** on a sign-in page.
3. Either enter the connection code/address (for example `http://192.168.1.20:3000`) or import the QR image saved from Settings. The app opens the main device's sign-in page.
4. Sign in with your normal Auto Torque account on the host. The QR code is only a connection address; it is not a password or a login token.
5. Create a clearly named test customer on one device, then find it on the other. Edit the test record from the secondary device and confirm the change is visible on the main device before entering production data.

### Native desktop app: remote-only secondary mode (Windows)

A packaged desktop build can now start as a remote-only client. In this mode it checks `AUTO_TORQUE_REMOTE_URL` **before** creating the application-data directory, copying a SQLite seed, or launching the local Next.js server. It navigates the native window to the main device's server. If the variable is present but invalid, startup fails closed rather than silently creating a local database.

1. First configure and start the main device using the host steps above. Use the saved QR code to read the exact host address, such as `http://192.168.1.20:3000`.
2. On the secondary Windows computer, open PowerShell. If you have a project checkout, you can use the helper script:
   
   ```powershell
   .\scripts\start-remote-secondary.ps1 -AppPath "C:\Path\To\Auto Torque.exe" -HostUrl "http://192.168.1.20:3000"
   ```

   Or launch the packaged executable directly:
   
   ```powershell
   $env:AUTO_TORQUE_REMOTE_URL = "http://192.168.1.20:3000"
   $env:AUTO_TORQUE_LAN_HOST = "false"
   $env:AUTO_TORQUE_LAN_ORIGINS = ""
   Start-Process "C:\Path\To\Auto Torque.exe"
   ```

   Replace the sample URL and executable path. The URL must be a private LAN IP address or a `.local` hostname, with no path, query, fragment, or credentials.
3. Sign in normally in the native window. All application reads and writes go to the main device's server/database. The secondary app does not start its own Next server or initialize/copy its SQLite database in remote-only mode.
4. To return to standalone local mode, close the app and launch it without `AUTO_TORQUE_REMOTE_URL`. Only do this if you actually want an independent local installation; it will initialize/use a local database.

**Existing local data is not automatically deleted.** If this device was previously run in local mode, its old database file may still be present but is not opened by remote-only startup. Back it up first; remove it manually only if you are certain it contains no data you need. This pass provides address-based native remote mode; direct QR-image import into the native startup path and one-time host-approved pairing/revocation remain future work.

### What is shared, and what is not

- Customer, vehicle, work order, inventory, quote, invoice, and other server-backed records are stored in the main device's SQLite database because both devices use the same server.
- This is live shared access, not database replication or offline synchronization. If Wi-Fi drops or the main device is off, the secondary device cannot use the records until the connection returns.
- The secondary browser does not receive a copy of the SQLite database. Browser session cookies and ordinary browser cache may still exist on the secondary device.
- Keep regular backups of the main device's database. A failure of the main device affects all connected clients.

### Security and troubleshooting

- Use only a trusted private Wi-Fi network. Do not use a guest/public network and do not expose the host port to the internet.
- HTTP LAN traffic is not encrypted. Do not use it on an untrusted network; HTTPS with a certificate trusted by the secondary device is preferable when available.
- If the secondary device cannot connect, confirm both devices are on the same subnet, the host app is still running, Windows Firewall allows TCP 3000 on Private, and the URL uses the host's current LAN address.
- If sign-in reports an invalid origin, make sure `AUTO_TORQUE_LAN_ORIGINS` contains the exact origin the secondary device uses, including scheme and port, and restart the main app.
- If records do not appear on both devices, verify the secondary browser's address bar shows the main device's LAN URL, not `localhost` or another installation.

## 13. Reports, dashboard, and reminders

- Use dashboard widgets to monitor the operational information your role can access.
- Use reports for a defined period and check filters before interpreting totals.
- Check whether a report uses invoice date, service date, payment date, or another date basis.
- Review scheduled reminders/messages and verify that the relevant delivery integration is configured.
- Treat exports as sensitive business data and store them in an approved location.

If a chart or report appears empty, check date range, organization, filters, permissions, and whether records exist for that period before assuming data was lost.

## 14. Organization settings, roles, and licensing

The application supports organizations, memberships, roles/permissions, invitations, settings, audit logs, and plan-dependent features in applicable deployments.

- Select the correct organization before creating or editing records.
- Ask an administrator to grant access rather than using another person's login.
- Review pending invitations and remove access that is no longer required.
- For self-hosted deployments, feature availability and branding may be affected by license settings.
- For cloud deployments, subscription status may determine which features are available.

Do not edit database rows directly to bypass a permission or licensing error. Resolve the role, configuration, or subscription problem through the supported administration workflow.

## 15. Search, save, delete, and button troubleshooting

For any form or action:

1. Complete required fields and review the selected customer/vehicle/organization.
2. Click the action once.
3. Wait for a success or error message; avoid repeated clicks while an operation is pending.
4. Re-open or refresh the record/list to confirm persistence.
5. If it failed, note the exact error and retry only after checking whether the first request created the record.

If a button appears to do nothing:

- Check required fields and validation messages.
- Check role/permission access.
- Check whether a modal is behind another window or whether the button is disabled.
- Check the browser developer console and server logs.
- For the desktop build, inspect `runtime.log` in the Tauri application-data directory.
- For email, payment, messaging, AI, or other integrations, check the provider configuration and logs.
- Report the screen, button label, steps to reproduce, expected result, actual result, and any error text.

Buttons that create, update, delete, export, share, or send data should be verified against the saved backend state and error path. Do not treat visual feedback alone as proof that a backend operation succeeded.

## 16. Backup, restore, and upgrades

Before upgrading:

1. Close the application or use a maintenance window to avoid concurrent writes.
2. Back up the SQLite database and any upload/file directories.
3. Confirm the backup can be opened or restored in a separate test location.
4. Review schema and release notes.
5. Run the upgrade on a copy first.
6. Keep the previous working build and backup until the new release is verified.

For the desktop version, application data is stored in the operating system's app-data directory, not in the read-only application bundle. Reinstalling/upgrading the app should not be treated as a backup strategy.

## 17. Administrator quick checklist

- [ ] Strong, private authentication secret configured.
- [ ] First administrator account secured and registration policy reviewed.
- [ ] Correct organization roles and permissions assigned.
- [ ] Email/payment/messaging credentials stored server-side and tested.
- [ ] Database and uploads backed up.
- [ ] HTTPS and reverse-proxy trust configured for remote access.
- [ ] Restore procedure tested.
- [ ] Desktop package tested on a clean target machine.
- [ ] Critical create/update/delete/share flows tested using non-production records.

## 18. Support information to collect

When reporting a defect, include:

- Application version and deployment type (web, development desktop, or packaged desktop).
- Operating system and browser/WebView details where applicable.
- Page/module and exact button label.
- Steps to reproduce using test data.
- Expected versus actual behavior.
- Error message and timestamp.
- Relevant sanitized log excerpt.

Never include passwords, API keys, session cookies, bearer tokens, private customer data, or an unredacted production database in a bug report.
