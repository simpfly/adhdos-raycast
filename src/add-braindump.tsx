import {LaunchProps} from '@raycast/api';
import { BrainCreate } from './brain-create';
export default function Command(props:LaunchProps) {
 return <BrainCreate initialInput={props.fallbackText || ''}/>;
}
