package model

type Metadata struct {
	Namespace  string
	Name       string
	Version    uint64
	Generation uint64
	Finalizers []string
	Deleting   bool
}

type Object struct {
	Metadata
	Labels map[string]string
	Status string
}

func (o Object) Key() string { return o.Namespace + "/" + o.Name }
func (o Object) Clone() Object {
	n := o
	n.Finalizers = append([]string(nil), o.Finalizers...)
	if o.Labels != nil {
		n.Labels = make(map[string]string, len(o.Labels))
		for k, v := range o.Labels {
			n.Labels[k] = v
		}
	}
	return n
}
