# EV charging certificate template

`ev-charging-certificate.html` is the supplied visual source for EV charge point certificates.
The PDF renderer mirrors its branding header, charger details, supply table, connector blocks,
overall result, notes, declaration, and engineer sign-off.

Ohm Audit maps the template tokens from immutable inspection revisions. It also retains the
following recorded fields that are not present in the original HTML:

- charger power output;
- supply phase count and earthing arrangement;
- connector type;
- PE pre-test, CP error, PE error, and CP states results.

Supply and connector sections are generated dynamically, so reports are not limited to the four
placeholder rows included in the source HTML.
