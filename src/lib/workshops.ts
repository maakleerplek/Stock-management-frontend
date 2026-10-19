/**
 * HTL workshops from the TV's screen data, which scrapes the public agenda.
 * Only upcoming ones are there, and attendees are not public: those need
 * read access to Odoo (event.registration).
 */
export interface Workshop {
  slug: string;
  title: string;
  dateISO: string;
  time: string;
  price: string;
  link: string;
  location?: string;
  category?: string;
}

/** Workshops in the High Tech Lab only: not the open labs, not other labs' workshops. */
export function htlWorkshops(screen: { workshops?: Workshop[] }): Workshop[] {
  return (screen.workshops ?? [])
    .filter(w => w.location === 'High Tech Lab' && w.category === 'Workshop')
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}
