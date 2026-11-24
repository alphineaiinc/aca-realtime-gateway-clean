-- Draft isolated ledger; no legacy balances imported without reconciliation.
CREATE TABLE aca_partner_funds (
 partner_id integer PRIMARY KEY REFERENCES partners(id),
 available_cents bigint NOT NULL CHECK(available_cents>=0)
);
CREATE TABLE aca_partner_reservations (
 partner_id integer NOT NULL REFERENCES aca_partner_funds(partner_id),
 request_id text NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 PRIMARY KEY(partner_id,request_id)
);
REVOKE ALL ON aca_partner_funds,aca_partner_reservations FROM PUBLIC;
