import {Action,ActionPanel,Clipboard,Form,LaunchProps,useNavigation} from '@raycast/api';
import {useEffect,useRef,useState} from 'react';
import {Create} from './views';
import {BrainCreate} from './brain-create';
import {t} from './strings';
export default function Capture(props:LaunchProps<{arguments:{text?:string}}>) {
 const initial=props.arguments?.text || '';
 const [content,setContent]=useState(initial);
 const [destination,setDestination]=useState('board');
 const [error,setError]=useState<string>();
 const [loading,setLoading]=useState(!initial);
 const edited=useRef(false);const {push}=useNavigation();
 useEffect(()=>{
  if(initial)return;
  let active=true;
  void Clipboard.readText().then(value=>{if(active&&!edited.current)setContent(value || '');})
   .catch(()=>{if(active&&!edited.current)setError(t('captureReadError'));})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[initial]);
 function proceed(){
  if(!content.trim()){setError(t('captureEmpty'));return;}
  // Keep the capture draft on the navigation stack; the existing forms own validation,
  // pending-operation recovery and writes. Never auto-submit clipboard contents.
  edited.current=true;
  push(destination==='board'?<Create kind="board" initialContent={content}/>:<BrainCreate initialInput={content}/>);
 }
 return <Form navigationTitle={t('capture')} isLoading={loading} actions={<ActionPanel><Action.SubmitForm title={t('captureNext')} onSubmit={proceed}/></ActionPanel>}>
  <Form.TextArea id="capture" title={t('captureContent')} placeholder={t('capturePlaceholder')} value={content} onChange={value=>{edited.current=true;setContent(value);setError(undefined);}} error={error}/>
  <Form.Dropdown id="destination" title={t('captureDestination')} value={destination} onChange={setDestination}><Form.Dropdown.Item value="board" title="Board"/><Form.Dropdown.Item value="brain" title="BrainDump"/></Form.Dropdown>
  <Form.Description text={t('captureHint')}/>
 </Form>;
}
