const files:Record<string,string>={dashboard:'dashboard/dashboard-view',transactions:'transactions/transactions-view',expenses:'expenses/expenses-view',accounts:'accounts/accounts-view',family:'family/family-view',management:'management/management-view',roles:'roles/roles-view',support:'support/issue-list',documents:'documents/documents-view'};
export function pageTarget(path:string){
  const segment=path.split('/')[1]||'dashboard';let file=files[segment]||'dashboard/dashboard-view';let key=segment;
  if(segment==='support'&&path.split('/').length>2){file='support/issue-detail';key='support.detail';}
  if(segment==='family'&&path!=='/family'){file='family/participant-create';key='family.profile';}
  if(segment==='documents'&&path.endsWith('/upload'))file='documents/document-upload-view';
  return {id:`page.${key}`,source:`apps/web/src/features/${file}.tsx`};
}
export const widgetSources:Record<string,string>={support:'support-widget',flow:'cash-flow-widget',tasks:'payment-tasks'};
