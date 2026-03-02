import { redirect } from 'next/navigation';

// Compatibility route:
// Older checkout flow redirects to /e-commerce/thank-you/:orderNumber
// The real page lives at /e-commerce/order-confirmation/:orderNumber
export default function ThankYouRedirectPage({
  params,
}: {
  params: { orderNumber: string };
}) {
  const orderNumber = params?.orderNumber;
  if (!orderNumber) redirect('/e-commerce');
  redirect(`/e-commerce/order-confirmation/${encodeURIComponent(orderNumber)}`);
}
