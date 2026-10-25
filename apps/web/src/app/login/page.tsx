import { AccountForm } from '../../features/auth/account-form';
export const dynamic = 'force-dynamic';
export default function Login() { return <AccountForm developmentLogin={process.env.APP_ENV === 'development' && process.env.ENABLE_DEV_LOGIN === '1'}/>; }
