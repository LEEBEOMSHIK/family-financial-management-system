import { ParticipantCreate } from '../../../../../features/family/participant-create';
export default async function ParticipantEditPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ParticipantCreate participantId={id}/>;}
