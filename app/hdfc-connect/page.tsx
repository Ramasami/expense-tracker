import HDFCConnect from "./connect";
export const metadata = {
  title: "Connect HDFC · Budget Tracker",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <HDFCConnect />;
}
