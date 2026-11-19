# BICO Order Assistant

A Chrome extension that helps customer-service staff read Inditex BICO order pages, by summarising an order's past Cases next to the page.

## Language

**Panel**:
The floating "BICO 도우미" box shown on a BICO order page. It can be turned on or off from the extension popup.
_Avoid_: Popup (that is the extension's toolbar settings window), widget

**Section**:
One titled, minimisable block inside the Panel. Currently only the Cases section exists.
_Avoid_: Card, tab (BICO's own tabs are a different thing)

**Case**:
A customer-service ticket recorded against an order in BICO.
_Avoid_: Ticket, issue

**SUBTYPE code**:
The leading four-digit code of a Case's subtype (for example 0906, 1005, 0804), used to group Cases.
_Avoid_: Category code, type

**Cases summary**:
The count of Cases per SUBTYPE code for one order over the last year, shown in the Cases section.
_Avoid_: Cases stats, ratio
