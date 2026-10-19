import {LaunchProps} from '@raycast/api';
import { Create } from './views';
export default function Command(props:LaunchProps) {
 return <Create kind="board" initialContent={props.fallbackText || ''}/>;
}
