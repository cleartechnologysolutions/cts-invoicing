import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Invoicing | Clear Technology Solutions',description:'Customers, invoices and purchase records for Clear Technology Solutions.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
