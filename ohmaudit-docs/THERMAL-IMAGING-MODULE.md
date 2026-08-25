# Thermal Imaging reporting

Thermal imaging is a site-level inspection module. A visit contains one thermal imaging task rather
than one task per asset, allowing an engineer to survey boards, enclosures, switchgear, and other
target items discovered on site.

## Engineer workflow

1. Create a visit and select **Thermal Imaging** as the inspection module.
2. Complete the **Details** step with the inspection scope, method, coverage, limitations, operating
   and environmental conditions, temperatures, client representative, and equipment used.
3. Upload the full JPEG, PNG, or WebP survey into the dedicated **Image gallery**. Images initially
   enter **Needs sorting** and can be dragged or multi-selected into infrared and standard groups.
   Engineers can retain the original filename while adding a clearer display name and searchable
   tags. Images are private and stored in the organisation's R2 media bucket against the inspection.
4. Select related images and group them into a target item. Each target defaults to **No issues**.
5. If an anomaly is present, select **Report fault** and record the issue summary, severity,
   temperatures, observations, and recommendation.
6. Review, sign, and submit the report for office review.

Draft target data is saved locally on the engineer's device. Image upload and final submission need
a network connection so that the report cannot reference evidence that has not reached R2.

## Office workflow and reports

Submitted thermal inspections use the standard inspection review and approval permissions. The
review page presents target-level conditions, readings, faults, and all uploaded evidence. Approval
and document issue create a **Thermal Imaging Report** associated with the site. Because site reports
are included by the existing portfolio queries, the issued report automatically appears on both the
site and its client's reports pages.

The PDF contains the survey scope, method, selected equipment and limitations on its cover, followed
by one page per target item. Up to two JPEG evidence images are
embedded per target, followed by the recorded condition, temperature values, observations, and
recommendation. User-entered text is rendered in uppercase for consistent field readability.

## Organisation equipment register

Organisation Settings includes a generic equipment register for thermal cameras, meters, testers,
and future instrument types. Organisation managers maintain each item's name, type, manufacturer,
model, serial number, calibration due date, and notes. Active equipment is available to both signed-in
and guest engineers during the inspection; the selected record is snapshotted into the submitted
report so later register changes do not alter historical evidence.
